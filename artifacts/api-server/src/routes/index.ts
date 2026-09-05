import { Router, type IRouter } from "express";
import commerceRouter from "./commerce";
import healthRouter from "./health";
import accountRouter from "./account";
import intelligenceRouter from "./intelligence";
import customerServiceRouter from "./customerService";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(accountRouter);
router.use(intelligenceRouter);
router.use(customerServiceRouter);

export default router;
