import {
  getAgentMppReadiness,
  type AgentMppEnvironment,
} from "./agentMpp";
import { getAgentMppOperationalSummary } from "./analyticsService";

export async function getReleaseDiagnostics(
  env: AgentMppEnvironment = process.env,
  loadSecret?: (environment: AgentMppEnvironment) => Promise<string>,
) {
  const agentCommerce = await getAgentMppReadiness(env, loadSecret);
  return {
    status: "ok" as const,
    agentCommerce: {
      state: agentCommerce.state,
      reason: agentCommerce.reason,
      enabled: agentCommerce.enabled,
      priceSource: agentCommerce.priceSource,
      priceOverrideConfigured: agentCommerce.priceOverrideConfigured,
      stripeMode: agentCommerce.stripeMode,
      credentialSource: agentCommerce.credentialSource,
      operational: getAgentMppOperationalSummary(),
    },
  };
}