import { desktopServices } from "./composition.js";
import { AppRouter } from "./routes/router.js";

export function App(): React.JSX.Element {
  return <AppRouter services={desktopServices} />;
}
