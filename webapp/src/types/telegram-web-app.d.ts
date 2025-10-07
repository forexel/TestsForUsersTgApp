declare namespace TelegramWebApp {
  interface ThemeParams {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  }

  interface User {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  }

  interface WebApp {
    initData: string;
    initDataUnsafe: TelegramInitData | null;
    ready(): void;
    expand(): void;
    showPopup(params: { title?: string; message: string; buttons?: Array<{ id?: string; type: "default" | "ok" | "close"; text?: string }>; }): void;
    HapticFeedback?: {
      notificationOccurred?(type: "success" | "error" | "warning"): void;
    };
  }
}

declare interface TelegramInitData {
  query_id?: string;
  user?: TelegramWebApp.User;
  receiver?: TelegramWebApp.User;
  auth_date?: number;
  hash?: string;
}

declare const Telegram: { WebApp: TelegramWebApp.WebApp };
declare const WebApp: TelegramWebApp.WebApp;
