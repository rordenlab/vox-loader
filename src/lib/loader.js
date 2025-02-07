import readVox from "vox-reader"
import * as nifti from "nifti-reader-js";

function toArrayBuffer(hdr, includeExtensions = false) {
  const SHORT_SIZE = 2;
  const FLOAT32_SIZE = 4;
  let byteSize = 348 + 4; // + 4 for the extension bytes

  // calculate necessary size
  if (includeExtensions) {
    for (let extension of hdr.extensions) {
      byteSize += extension.esize;
    }
  }
  let byteArray = new Uint8Array(byteSize);
  let view = new DataView(byteArray.buffer);
  // sizeof_hdr
  view.setInt32(0, 348, hdr.littleEndian);

  // data_type, db_name, extents, session_error, regular are not used

  // dim_info
  view.setUint8(39, hdr.dim_info);

  // dims
  for (let i = 0; i < 8; i++) {
    view.setUint16(40 + SHORT_SIZE * i, hdr.dims[i], hdr.littleEndian);
  }

  // intent_p1, intent_p2, intent_p3
  view.setFloat32(56, hdr.intent_p1, hdr.littleEndian);
  view.setFloat32(60, hdr.intent_p2, hdr.littleEndian);
  view.setFloat32(64, hdr.intent_p3, hdr.littleEndian);

  // intent_code, datatype, bitpix, slice_start
  view.setInt16(68, hdr.intent_code, hdr.littleEndian);
  view.setInt16(70, hdr.datatypeCode, hdr.littleEndian);
  view.setInt16(72, hdr.numBitsPerVoxel, hdr.littleEndian);
  view.setInt16(74, hdr.slice_start, hdr.littleEndian);

  // pixdim[8], vox_offset, scl_slope, scl_inter
  for (let i = 0; i < 8; i++) {
    view.setFloat32(
      76 + FLOAT32_SIZE * i,
      hdr.pixDims[i],
      hdr.littleEndian
    );
  }
  view.setFloat32(108, hdr.vox_offset, hdr.littleEndian);
  view.setFloat32(112, hdr.scl_slope, hdr.littleEndian);
  view.setFloat32(116, hdr.scl_inter, hdr.littleEndian);

  // slice_end
  view.setInt16(120, hdr.slice_end, hdr.littleEndian);

  // slice_code, xyzt_units
  view.setUint8(122, hdr.slice_code);
  view.setUint8(123, hdr.xyzt_units);

  // cal_max, cal_min, slice_duration, toffset
  view.setFloat32(124, hdr.cal_max, hdr.littleEndian);
  view.setFloat32(128, hdr.cal_min, hdr.littleEndian);
  view.setFloat32(132, hdr.slice_duration, hdr.littleEndian);
  view.setFloat32(136, hdr.toffset, hdr.littleEndian);

  // glmax, glmin are unused

  // descrip and aux_file
  byteArray.set(new TextEncoder().encode(hdr.description), 148);
  byteArray.set(new TextEncoder().encode(hdr.aux_file), 228);

  // qform_code, sform_code
  view.setInt16(252, hdr.qform_code, hdr.littleEndian);
  view.setInt16(254, hdr.sform_code, hdr.littleEndian);

  // quatern_b, quatern_c, quatern_d, qoffset_x, qoffset_y, qoffset_z, srow_x[4], srow_y[4], and srow_z[4]
  view.setFloat32(256, hdr.quatern_b, hdr.littleEndian);
  view.setFloat32(260, hdr.quatern_c, hdr.littleEndian);
  view.setFloat32(264, hdr.quatern_d, hdr.littleEndian);
  view.setFloat32(268, hdr.qoffset_x, hdr.littleEndian);
  view.setFloat32(272, hdr.qoffset_y, hdr.littleEndian);
  view.setFloat32(276, hdr.qoffset_z, hdr.littleEndian);
  const flattened = hdr.affine.flat();
  // we only want the first three rows
  for (let i = 0; i < 12; i++) {
    view.setFloat32(
      280 + FLOAT32_SIZE * i,
      flattened[i],
      hdr.littleEndian
    );
  }
  // intent_name and magic
  byteArray.set(new TextEncoder().encode(hdr.intent_name), 328);
  byteArray.set(new TextEncoder().encode(hdr.magic), 344);
  // add our extension data
  if (includeExtensions) {
    byteArray.set(Uint8Array.from([1, 0, 0, 0]), 348);
    let extensionByteIndex = hdr.getExtensionLocation();
    for (const extension of hdr.extensions) {
      view.setInt32(
      extensionByteIndex,
      extension.esize,
      extension.littleEndian
      );
      view.setInt32(
      extensionByteIndex + 4,
      extension.ecode,
      extension.littleEndian
      );
      byteArray.set(
      new Uint8Array(extension.edata),
      extensionByteIndex + 8
      );
      extensionByteIndex += extension.esize;
    }
    } else {
    // In a .nii file, these 4 bytes will always be present
    byteArray.set(new Uint8Array(4).fill(0), 348);
  }

  return byteArray.buffer;
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
    //const hdrBuffer = toArrayBuffer(hdr)
    // Merge header and voxel data
    const niftiData = new Uint8Array(hdrBuffer.byteLength + voxelData.byteLength);
    niftiData.set(new Uint8Array(hdrBuffer), 0);
    niftiData.set(voxelData, hdrBuffer.byteLength);
    return niftiData;
  } catch (error) {
    console.error("Error reading MagicaVoxel file:", error.message);
  }
}
