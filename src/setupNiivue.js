import { Niivue } from '@niivue/niivue'
import { vox2nii } from './lib/loader'

export async function setupNiivue(element) {
  const nv = new Niivue()
  nv.attachToCanvas(element)
  // supply loader function, fromExt, and toExt (without dots)
  nv.useLoader(vox2nii, 'vox', 'nii')
  await nv.loadImages([
    {
      url: '/monu1.vox'
    }
  ])
}
