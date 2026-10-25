/** The townsfolk's cheap level (FarFolk): plain figures in the colour of their clothes (instance colour). */
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { defineKind } from '../materials';

export const FAR_FOLK = defineKind('far folk', ['position', 'normal'], () => new MeshStandardNodeMaterial({ roughness: 0.85 }));
