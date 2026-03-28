import { BrowserWindow, Rectangle } from 'electron';

export function smoothResizeToTarget(
  window: BrowserWindow,
  targetBounds: Rectangle,
  step = 10,
  interval = 16
) {
  const currentBounds = window.getBounds();

  const dx = (targetBounds.width - currentBounds.width) / step;
  const dy = (targetBounds.height - currentBounds.height) / step;
  const dxPos = (targetBounds.x - currentBounds.x) / step;
  const dyPos = (targetBounds.y - currentBounds.y) / step;

  let currentStep = 0;

  const intervalId = setInterval(() => {
    currentStep += 1;

    if (currentStep > step) {
      clearInterval(intervalId);
      window.setBounds(targetBounds); // Ensure it snaps to the final size
      return;
    }

    window.setBounds({
      width: Math.round(currentBounds.width + dx * currentStep),
      height: Math.round(currentBounds.height + dy * currentStep),
      x: Math.round(currentBounds.x + dxPos * currentStep),
      y: Math.round(currentBounds.y + dyPos * currentStep)
    });
  }, interval); // Default: ~60fps
}
