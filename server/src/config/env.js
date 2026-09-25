import dotenv from "dotenv";

// Ruta estable tanto desde npm como desde el script o una terminal en la raíz.
dotenv.config({ path: new URL("../../.env", import.meta.url), quiet: true });
