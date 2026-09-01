import { Router, type IRouter } from "express";
import commerceRouter from "./commerce";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commerceRouter);

export default router;
