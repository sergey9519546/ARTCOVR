import { Router, type IRouter } from "express";
import commerceRouter from "./commerce";
import healthRouter from "./health";
import accountRouter from "./account";
import intelligenceRouter from "./intelligence";
import customerServiceRouter from "./customerService";
import salesRouter from "./sales";
import agentCommerceRouter from "./agentCommerce";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(accountRouter);
router.use(intelligenceRouter);
router.use(customerServiceRouter);
router.use(salesRouter);
router.use(agentCommerceRouter);

export default router;
