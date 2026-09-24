interface JoplinApi {
  plugins: { register(plugin: { onStart(): Promise<void> }): void };
  versionInfo(): Promise<{ platform: 'desktop' | 'mobile'; version: string }>;
  data: {
    get(path: string[], query?: Record<string, unknown>): Promise<any>;
    post(path: string[], query: Record<string, unknown> | null, body: Record<string, unknown>): Promise<any>;
  };
  commands: {
    register(command: { name: string; label: string; iconName?: string; execute(): Promise<void> }): Promise<void>;
  };
  views: {
    panels: {
      create(id: string): Promise<string>;
      setHtml(handle: string, html: string): Promise<void>;
      addScript(handle: string, path: string): Promise<void>;
      onMessage(handle: string, callback: (message: any) => Promise<any>): void;
      postMessage(handle: string, message: any): Promise<void>;
      show(handle: string, show?: boolean): Promise<void>;
      visible(handle: string): Promise<boolean>;
    };
    menuItems: {
      create(id: string, commandName: string, location?: string): Promise<void>;
    };
  };
}

declare const joplin: JoplinApi;
export default joplin;
