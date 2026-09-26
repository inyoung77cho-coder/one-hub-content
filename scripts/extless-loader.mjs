// 확장자 없는 상대경로 import(저장소 관례)를 node 테스트에서 해석하기 위한 로더.
//   사용: node --import ./scripts/extless-loader.mjs <test.mjs>
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./_extless-resolve.mjs", pathToFileURL("./scripts/"));
