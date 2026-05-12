type Rectangle = {
    id: string,
    imageId: string,
    renderPosition: vec2,
    renderScaleX: number,
    renderScaleY: number,
    renderRotation: number,
    corners: vec2[],
    color: string,
};

type vec2 = {
    x: number,
    y: number
}
