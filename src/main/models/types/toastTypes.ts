export enum ToastType {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  COUNTDOWN = 'COUNTDOWN'
}

export interface ToastAction {
  type: 'CANCEL_TASK'; // Add more types as needed
  args?: Record<string, any>; // Arguments passed to handle the action
}

export interface ToastArgs {
  type: ToastType; // Type of the toast
  message: string; // Message to display
  duration?: number; // Duration in milliseconds
  countdown?: number; // Countdown in seconds (optional for COUNTDOWN)
  action?: ToastAction; // Action to perform when a button is clicked
}
