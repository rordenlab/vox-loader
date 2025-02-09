import readVox from "vox-reader"
import * as nifti from "nifti-reader-js";

export async function vox2nii(inBuffer, isVerbose = true) {
  try {
    let byteArray;
    // Ensure input is Uint8Array (required for vox-reader)
    if (inBuffer instanceof Uint8Array) {
      byteArray = inBuffer;
    } else if (inBuffer instanceof ArrayBuffer) {
      byteArray = new Uint8Array(inBuffer);
    } else {
      throw new Error("Unsupported input type: Expected Uint8Array or ArrayBuffer.");
    }
    // Parse .vox file using vox-reader
    const vox = readVox(byteArray);
    if (!vox || !vox.size || !vox.xyzi?.values || !vox.rgba?.values) {
      throw new Error("Invalid or empty MagicaVoxel file.");
    }
    const { x: width, y: height, z: depth } = vox.size;
    if (isVerbose) {
      console.log(`Loaded MagicaVoxel: ${width}x${height}x${depth}`);
    }
    // RGB NIfTI requires 4 channels: R, G, B, A
    const voxelData = new Uint8Array(width * height * depth * 4).fill(0);
    // Convert MagicaVoxel color indices to RGBA
    for (const voxel of vox.xyzi.values) {
      const { x, y, z, i } = voxel;
      //console.log(c)
      const color = vox.rgba.values[i]; // Lookup color from palette
      if (color) {
        const index = (x + y * width + z * width * height) * 4;
        voxelData[index] = color.r; // Red
        voxelData[index + 1] = color.g; // Green
        voxelData[index + 2] = color.b; // Blue
        voxelData[index + 3] = color.a; // Alpha
      }
    }
    // Create and configure NIfTI-1 header for RGBA data
    const hdr = new nifti.NIFTI1();
    hdr.littleEndian = true;
    hdr.dims[0] = 3;
    hdr.dims[1] = width;
    hdr.dims[2] = height;
    hdr.dims[3] = depth;
    hdr.datatypeCode = 2304; // DT_RGBA32
    hdr.numBitsPerVoxel = 32;
    hdr.pixDims = [1, 1, 1, 1, 1, 0, 0, 0]; // Default voxel size
    hdr.vox_offset = 352; // Standard offset
    hdr.scl_slope = 1;
    hdr.scl_inter = 0;
    hdr.qform_code = 0;
    hdr.sform_code = 0;
    hdr.littleEndian = true
    hdr.magic = "n+1"
    const hdrBuffer = hdr.toArrayBuffer()
    // Merge header and voxel data
    const niftiData = new Uint8Array(hdrBuffer.byteLength + voxelData.byteLength);
    niftiData.set(new Uint8Array(hdrBuffer), 0);
    niftiData.set(voxelData, hdrBuffer.byteLength);
    return niftiData;
  } catch (error) {
    console.error("Error reading MagicaVoxel file:", error.message);
  }
}
