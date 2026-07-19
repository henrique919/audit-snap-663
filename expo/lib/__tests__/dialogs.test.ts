/**
 * Cross-platform dialog layer — native delegates to Alert.alert unchanged;
 * web falls back to window.alert/confirm and the ActionSheetHost listener
 * (since Alert.alert is a no-op in react-native-web).
 */

/* eslint-disable import/first -- imports intentionally follow Jest module mocks */

interface MockAlertButton {
  text?: string;
  style?: string;
  onPress?: () => void;
}

interface WindowStub {
  alert: jest.Mock;
  confirm: jest.Mock;
}

const mockAlert = jest.fn();

jest.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Platform: { OS: "ios" },
}));

import { Platform } from "react-native";
import {
  __hasActionSheetListener,
  __registerActionSheetListener,
  showActions,
  showAlert,
  showConfirm,
} from "@/lib/dialogs";

function setPlatform(os: "ios" | "web"): void {
  (Platform as { OS: string }).OS = os;
}

function stubWindow(confirmReturns: boolean): WindowStub {
  const stub: WindowStub = { alert: jest.fn(), confirm: jest.fn(() => confirmReturns) };
  (globalThis as unknown as { window: WindowStub }).window = stub;
  return stub;
}

afterEach(() => {
  mockAlert.mockReset();
  setPlatform("ios");
  __registerActionSheetListener(null);
  delete (globalThis as { window?: unknown }).window;
});

describe("showAlert", () => {
  it("delegates to Alert.alert on native", () => {
    setPlatform("ios");
    showAlert("Title", "Message");
    expect(mockAlert).toHaveBeenCalledWith("Title", "Message");
  });

  it("uses window.alert on web, combining title and message", () => {
    setPlatform("web");
    const win = stubWindow(true);
    showAlert("Title", "Message");
    expect(win.alert).toHaveBeenCalledWith("Title\n\nMessage");
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("uses window.alert with just the title when no message is given", () => {
    setPlatform("web");
    const win = stubWindow(true);
    showAlert("Title only");
    expect(win.alert).toHaveBeenCalledWith("Title only");
  });
});

describe("showConfirm", () => {
  it("resolves true when the native confirm button is pressed", async () => {
    setPlatform("ios");
    mockAlert.mockImplementation((_title: string, _message: string, buttons: MockAlertButton[]) => {
      buttons.find((b) => b.text === "Delete")?.onPress?.();
    });
    const result = await showConfirm("Delete?", "Sure?", "Delete", true);
    expect(result).toBe(true);
  });

  it("resolves false when the native cancel button is pressed", async () => {
    setPlatform("ios");
    mockAlert.mockImplementation((_title: string, _message: string, buttons: MockAlertButton[]) => {
      buttons.find((b) => b.style === "cancel")?.onPress?.();
    });
    const result = await showConfirm("Delete?", "Sure?", "Delete", true);
    expect(result).toBe(false);
  });

  it("uses the supplied confirm/cancel labels on native", async () => {
    setPlatform("ios");
    mockAlert.mockImplementation((_title: string, _message: string, buttons: MockAlertButton[]) => {
      buttons[buttons.length - 1]?.onPress?.();
    });
    await showConfirm("Discard photo?", "Not saved.", "Discard", true, "Keep editing");
    const buttons = mockAlert.mock.calls[0][2] as MockAlertButton[];
    expect(buttons.map((b) => b.text)).toEqual(["Keep editing", "Discard"]);
    expect(buttons[1].style).toBe("destructive");
  });

  it("resolves via window.confirm on web", async () => {
    setPlatform("web");
    stubWindow(true);
    const result = await showConfirm("Delete?", "Sure?", "Delete", true);
    expect(result).toBe(true);
  });

  it("resolves false via window.confirm on web when declined", async () => {
    setPlatform("web");
    stubWindow(false);
    const result = await showConfirm("Delete?", "Sure?", "Delete", true);
    expect(result).toBe(false);
  });
});

describe("showActions", () => {
  it("delegates straight to Alert.alert on native", () => {
    setPlatform("ios");
    const actions = [{ text: "One" }, { text: "Two" }];
    showActions("Pick one", "sub", actions);
    expect(mockAlert).toHaveBeenCalledWith("Pick one", "sub", actions);
  });

  it("forwards to the registered ActionSheet listener on web instead of Alert.alert", () => {
    setPlatform("web");
    const listener = jest.fn();
    __registerActionSheetListener(listener);
    const actions = [{ text: "One" }];
    showActions("Pick", "sub", actions);
    expect(listener).toHaveBeenCalledWith({ title: "Pick", message: "sub", actions });
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("does not throw when no ActionSheet host is mounted on web", () => {
    setPlatform("web");
    expect(__hasActionSheetListener()).toBe(false);
    expect(() => showActions("Pick", undefined, [{ text: "One" }])).not.toThrow();
  });
});
