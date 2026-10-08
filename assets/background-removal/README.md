# Local foreground segmentation

`u2netp.onnx` is the small U²-Net model by Xuebin Qin et al., distributed under
Apache-2.0. The original license is included in `LICENSE-U2NET.txt`; the ONNX
distribution project's MIT license is included in `LICENSE-REMBG.txt`.

- Model/project: https://github.com/xuebinqin/U-2-Net
- ONNX distribution: https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
- Distribution checksum reference: https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py
- SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`
- MD5: `8e83ca70e441ab06c318d82300c84806`
- Size: 4,574,861 bytes

The bot runs this bundled model offline through ONNX Runtime Web (MIT), using
one WASM CPU thread in a cancellable Node worker. No model or image is downloaded
or uploaded during a sticker request. The 320×320 RGB input uses the published
U²-Net preprocessing; the foreground mask is resized back to the prepared image.

U²-NetP is a lightweight salient-object model, not a perfect hair/glass matte.
Complex backgrounds and multiple overlapping objects can require an external
segmentation service; the existing `api` provider supports that deployment.
