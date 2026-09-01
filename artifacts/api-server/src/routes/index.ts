import { Router, type IRouter } from "express";
import commerceRouter from "./commerce";
import healthRouter from "./health";
import accountRouter from "./account";
import intelligenceRouter from "./intelligence";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(accountRouter);
router.use(intelligenceRouter);

export default router;
