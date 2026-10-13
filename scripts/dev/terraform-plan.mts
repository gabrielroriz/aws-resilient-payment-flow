import type { PlanModule, PlannedResource, TerraformPlan } from './terraform-plan.types.mts';

// Every managed resource of one type, from the root module and all child modules.
export function plannedResources<Values>(plan: TerraformPlan, type: string): PlannedResource<Values>[] {
  return resourcesOf(plan.planned_values?.root_module).filter(
    (resource): resource is PlannedResource<Values> => resource.mode === 'managed' && resource.type === type,
  );
}

function resourcesOf(module: PlanModule | undefined): PlannedResource[] {
  return [...(module?.resources ?? []), ...(module?.child_modules ?? []).flatMap(resourcesOf)];
}
