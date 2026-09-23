import { base } from "@pc/config/eslint/base";
import { noReact } from "@pc/config/eslint/no-react";

export default [...base({ tsconfigRootDir: import.meta.dirname }), noReact];
