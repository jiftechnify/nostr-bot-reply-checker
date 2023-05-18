declare module "*/bot_config.json" {
  type Config = {
    privateKey: string;
    relayUrls: string[];
    profile: {
      name: string;
      display_name: string;
      about: string;
      [key: string]: string;
    };
  };

  export const value: Config;
}
