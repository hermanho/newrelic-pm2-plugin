
// https://github.com/Unitech/pm2/blob/5e708459aca32903fd363230e24c37b3e38bb48d/lib/God/ForkMode.js#L195
export interface PM2_LOG_OUT {
  process: {
    pm_id: string;
    name: string;
    rev: string;
    namespace: string;
  },
  at: number;
  data: string;
}