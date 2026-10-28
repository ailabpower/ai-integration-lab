// Scripts run outside Next.js, so load .env.local the same way Next does.
import { config } from "dotenv";

config({ path: ".env.local" });
config();
