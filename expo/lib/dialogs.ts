/**
 * Cross-platform dialog layer.
 *
 * `Alert.alert` is a no-op in react-native-web — on web it silently does
 * nothing, which breaks every confirmation, validation message and error
 * report in the app. Native keeps the real OS alert unchanged; web falls
 * back to window.alert/confirm for simple cases and a custom action sheet
 * (ActionSheetHost, mounted once in app/_layout.tsx) for button lists.
 */

import { Alert, Platform } from "react-native";

export interface DialogAction {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
}

export interface ActionSheetRequest {
  title: string;
  message?: string;
  actions: DialogAction[];
}

type ActionSheetListener = (request: ActionSheetRequest | null) => void;

let actionSheetListener: ActionSheetListener | null = null;

/** Registered by ActionSheetHost. Not for direct use outside that component. */
export function __registerActionSheetListener(listener: ActionSheetListener | null): void {
  actionSheetListener = listener;
}

/** Test-only: whether a host is currently registered. */
export function __hasActionSheetListener(): boolean {
  return actionSheetListener !== null;
}

/** Simple dismiss-only info alert. */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/**
 * Two-choice confirm (Cancel + a labelled action). Resolves `true` if the
 * user confirmed, `false` if cancelled or dismissed.
 */
export function showConfirm(
  title: string,
  message: string,
  confirmLabel: string = "OK",
  destructive: boolean = false,
  cancelLabel: string = "Cancel",
): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Arbitrary button list (3+ options, or options with per-button callbacks).
 * Native uses the real Alert action list; web renders a bottom sheet via
 * ActionSheetHost.
 */
export function showActions(title: string, message: string | undefined, actions: DialogAction[]): void {
  if (Platform.OS === "web") {
    if (actionSheetListener) {
      actionSheetListener({ title, message, actions });
    } else {
      console.log("[dialogs] no ActionSheet host mounted; actions dropped:", title);
    }
    return;
  }
  Alert.alert(title, message, actions);
}
