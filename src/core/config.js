import dotenv from "dotenv";
const NODE_ENV = "dev";

const envFile = NODE_ENV === "dev" ? ".env.dev" : ".env";
dotenv.config({ path: envFile });

console.log(`Loading environment: ${NODE_ENV} from ${envFile}`);




