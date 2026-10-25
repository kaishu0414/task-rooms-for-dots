import vinext from "vinext";
import { defineConfig } from "vite";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";
configureToolEnvironment(process.cwd());
export default defineConfig(async()=>{
 const {cloudflare}=await import("@cloudflare/vite-plugin");
 return {server:{host:"127.0.0.1"},plugins:[vinext(),sites({mockAuth:false}),cloudflare({
  viteEnvironment:{name:"rsc",childEnvironments:["ssr"]},inspectorPort:false,
  config:{main:"./worker/index.ts",compatibility_date:"2026-05-15",compatibility_flags:["nodejs_compat"],
   d1_databases:[{binding:"DB",database_name:"taskrooms-local",database_id:"00000000-0000-4000-8000-000000000000",migrations_dir:"drizzle"}],
   r2_buckets:[{binding:"BUCKET",bucket_name:"taskrooms-local"}]}
 })]};
});
