import { Router, type IRouter } from "express";
import commerceRouter from "./commerce";
import healthRouter from "./health";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);
router.use(accountRouter);

export default router;
