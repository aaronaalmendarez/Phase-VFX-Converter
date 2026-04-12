import eel
import os
import io
import time
import requests
import base64
import json
import re
from PIL import Image

eel.init('web')

@eel.expose
def fetch_and_slice(asset_id, cols, rows, target_id, is_group, api_key):
    try:
        eel.update_progress(0, 1, f"Fetching Asset ID {asset_id} from Roblox servers...")
        res = requests.get(f"https://assetdelivery.roblox.com/v1/asset/?id={asset_id}")
        
        if res.status_code != 200:
            return {"success": False, "error": f"Failed to fetch asset: {res.status_code}"}
            
        # Parse XML for decal URL if necessary
        content = res.text
        if content.startswith("<roblox"):
            match = re.search(r'<url>(.*?)</url>', content)
            if not match:
                return {"success": False, "error": "Could not extract image URL from Decal XML."}
            image_url = match.group(1).replace("&amp;", "&")
            img_res = requests.get(image_url)
            if img_res.status_code != 200:
                return {"success": False, "error": f"Failed to fetch extracted image: {img_res.status_code}"}
            img_bytes = img_res.content
        else:
            img_bytes = res.content
            
        eel.update_progress(1, 1, "Image fetched successfully. Prepping for slicing...")
        
        # Convert to base64 so we can cleanly reuse the exact same robust slice_and_upload logic
        b64_string = base64.b64encode(img_bytes).decode('utf-8')
        data_uri = f"data:image/png;base64,{b64_string}"
        
        return slice_and_upload(data_uri, cols, rows, target_id, is_group, api_key)
        
    except Exception as e:
        import traceback
        eel.log_error(str(e))
        return {"success": False, "error": str(e)}

@eel.expose
def slice_and_upload(image_base64, cols, rows, target_id, is_group, api_key):
    try:
        # 1. Parse Image
        header, encoded = image_base64.split(",", 1)
        image_data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(image_data))
        
        width, height = img.size
        frame_width = width // cols
        frame_height = height // rows
        
        total_frames = cols * rows
        asset_ids = []
        
        eel.log_message(f"Starting upload for {total_frames} frames...")
        
        target_context = {
            "creator": {
                "groupId": str(target_id)
            } if is_group else {
                "userId": str(target_id)
            }
        }

        # 2. Slice and Upload each frame
        for r in range(rows):
            for c in range(cols):
                frame_number = (r * cols) + c + 1
                
                left = c * frame_width
                top = r * frame_height
                right = left + frame_width
                bottom = top + frame_height
                
                frame = img.crop((left, top, right, bottom))
                
                frame_io = io.BytesIO()
                frame.save(frame_io, format="PNG")
                frame_bytes = frame_io.getvalue()
                
                # Update UI Progress
                eel.update_progress(frame_number, total_frames, f"Uploading frame {frame_number}/{total_frames}...")
                
                # Build Request
                url = "https://apis.roblox.com/assets/v1/assets"
                headers = {
                    "x-api-key": api_key.strip()
                }
                
                config = {
                    "assetType": "Decal",
                    "creationContext": target_context,
                    "displayName": f"Phase_VFX_Frame_{frame_number}",
                    "description": "Uploaded via Phase-Flipbook-Converter"
                }
                
                files = {
                    "request": (None, json.dumps(config), "application/json"),
                    "fileContent": ("frame.png", frame_bytes, "image/png")
                }
                
                response = requests.post(url, headers=headers, files=files)
                
                if response.status_code == 200:
                    data = response.json()
                    if "assetId" in data:
                        asset_ids.append(data["assetId"])
                    elif "operationId" in data:
                        op_id = data["operationId"]
                        eel.log_message(f"Frame {frame_number} queued... Waiting for generation.")
                        # Poll operation
                        op_url = f"https://apis.roblox.com/assets/v1/operations/{op_id}"
                        max_retries = 20
                        resolved_id = None
                        for i in range(max_retries):
                            op_res = requests.get(op_url, headers=headers)
                            if op_res.status_code == 200:
                                op_data = op_res.json()
                                if op_data.get("done") == True:
                                    resolved_id = op_data.get("response", {}).get("assetId")
                                    break
                            time.sleep(1)
                        if resolved_id:
                            asset_ids.append(resolved_id)
                        else:
                            eel.log_error(f"Frame {frame_number} operation timed out!")
                            return {"success": False, "error": f"Timed out waiting for frame {frame_number}"}
                else:
                    error_msg = f"Failed at frame {frame_number}: {response.status_code} - {response.text}"
                    eel.log_error(error_msg)
                    return {"success": False, "error": error_msg}
                # Small rate-limit prevention
                time.sleep(0.2)
                
        eel.log_message("All frames uploaded successfully!")
        return {"success": True, "ids": asset_ids}

    except Exception as e:
        import traceback
        eel.log_error(str(e))
        return {"success": False, "error": str(e)}

if __name__ == '__main__':
    # Options for PyInstaller compilation (suppress console, run web view)
    eel.start('index.html', size=(900, 650), port=0)
