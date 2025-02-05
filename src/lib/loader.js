import readVox from "vox-reader"
import * as nifti from "nifti-reader-js";

function str2BufferX(str, maxLen) {
  // emulate node.js Buffer.from
  // remove characters than could be used for shell expansion
  str = str.replace(/[`$]/g, '')
  const bytes = []
  const len = Math.min(maxLen, str.length)
  for (let i = 0; i < len; i++) {
    const char = str.charCodeAt(i)
    bytes.push(char & 0xff)
  }
  return bytes
}
// save NIfTI header into UINT8 array for saving to disk
function hdrToArrayBuffer352(hdr, isLittleEndian = true) {
  const SHORT_SIZE = 2
  const FLOAT32_SIZE = 4
  const byteArray = new Uint8Array(352).fill(0)
  const view = new DataView(byteArray.buffer)
  view.setInt32(0, 348, isLittleEndian)
  // data_type, db_name, extents, session_error, regular are not used
  // regular set to 'r' (ASCII 114) for Analyze compatibility
  view.setUint8(38, 114)
  // dim_info
  view.setUint8(39, hdr.dim_info)
  // dims
  for (let i = 0; i < 8; i++) {
    view.setUint16(40 + SHORT_SIZE * i, hdr.dims[i], isLittleEndian)
  }
  // intent_p1, intent_p2, intent_p3
  view.setFloat32(56, hdr.intent_p1, isLittleEndian)
  view.setFloat32(60, hdr.intent_p2, isLittleEndian)
  view.setFloat32(64, hdr.intent_p3, isLittleEndian)
  // intent_code, datatype, bitpix, slice_start
  view.setInt16(68, hdr.intent_code, isLittleEndian)
  view.setInt16(70, hdr.datatypeCode, isLittleEndian)
  view.setInt16(72, hdr.numBitsPerVoxel, isLittleEndian)
  view.setInt16(74, hdr.slice_start, isLittleEndian)
  // pixdim[8], vox_offset, scl_slope, scl_inter
  for (let i = 0; i < 8; i++) {
    view.setFloat32(76 + FLOAT32_SIZE * i, hdr.pixDims[i], isLittleEndian)
  }
  view.setFloat32(108, 352, isLittleEndian)
  view.setFloat32(112, hdr.scl_slope, isLittleEndian)
  view.setFloat32(116, hdr.scl_inter, isLittleEndian)
  view.setInt16(120, hdr.slice_end, isLittleEndian)
  // slice_code, xyzt_units
  view.setUint8(122, hdr.slice_code)
  //if (hdr.xyzt_units === 0) {
  //  view.setUint8(123, 10)
  //} else {
    view.setUint8(123, hdr.xyzt_units)
  //}
  // cal_max, cal_min, slice_duration, toffset
  view.setFloat32(124, hdr.cal_max, isLittleEndian)
  view.setFloat32(128, hdr.cal_min, isLittleEndian)
  view.setFloat32(132, hdr.slice_duration, isLittleEndian)
  view.setFloat32(136, hdr.toffset, isLittleEndian)
  // glmax, glmin are unused
  // descrip and aux_file
  byteArray.set(str2BufferX(hdr.description), 148)
  byteArray.set(str2BufferX(hdr.aux_file), 228)
  // qform_code, sform_code
  view.setInt16(252, hdr.qform_code, isLittleEndian)
  // if sform unknown, assume NIFTI_XFORM_SCANNER_ANAT
  //if (hdr.sform_code < 1 || hdr.sform_code < 1) {
  //  view.setInt16(254, 1, isLittleEndian)
  //} else {
    view.setInt16(254, hdr.sform_code, isLittleEndian)
  //}
  // quatern_b, quatern_c, quatern_d, qoffset_x, qoffset_y, qoffset_z, srow_x[4], srow_y[4], and srow_z[4]
  view.setFloat32(256, hdr.quatern_b, isLittleEndian)
  view.setFloat32(260, hdr.quatern_c, isLittleEndian)
  view.setFloat32(264, hdr.quatern_d, isLittleEndian)
  view.setFloat32(268, hdr.qoffset_x, isLittleEndian)
  view.setFloat32(272, hdr.qoffset_y, isLittleEndian)
  view.setFloat32(276, hdr.qoffset_z, isLittleEndian)
  const flattened = hdr.affine.flat()
  // we only want the first three rows
  for (let i = 0; i < 12; i++) {
    view.setFloat32(280 + FLOAT32_SIZE * i, flattened[i], isLittleEndian)
  }
  // magic
  view.setInt32(344, 3222382, true) // "n+1\0"
  return byteArray
}

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
    const hdrBuffer = hdrToArrayBuffer352(hdr)
    // Merge header and voxel data
    const niftiData = new Uint8Array(hdrBuffer.byteLength + voxelData.byteLength);
    niftiData.set(new Uint8Array(hdrBuffer), 0);
    niftiData.set(voxelData, hdrBuffer.byteLength);
    return niftiData;
  } catch (error) {
    console.error("Error reading MagicaVoxel file:", error.message);
  }
}
