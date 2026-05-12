declare const fx: {
  canvas(): GlfxCanvas;
};

export interface GlfxCanvas extends HTMLCanvasElement {
  texture(image: HTMLImageElement | HTMLCanvasElement): GlfxTexture;
  draw(texture: GlfxTexture): GlfxCanvas;
  perspective(before: number[], after: number[]): GlfxCanvas;
  update(): GlfxCanvas;
}

export interface GlfxTexture {
  destroy(): void;
}

export default fx;
