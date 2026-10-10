/**
 * The parts of `terraform show -json` output that the local development scripts read. A plan
 * describes every resource in the Terraform configuration without applying anything, so local
 * resources can follow Terraform instead of a copy of its definitions.
 */
export type TerraformPlan = { planned_values?: { root_module?: PlanModule } };

type PlanModule = { resources?: PlannedResource[]; child_modules?: PlanModule[] };

/**
 * A resource instance as the plan expects it after apply. Values known only after apply, such as
 * the IDs of resources that were never deployed, are missing.
 */
export type PlannedResource<Values = unknown> = {
  mode: string;
  type: string;
  /** The instance key of a resource created with for_each or count. */
  index?: string | number;
  values: Values;
};

/** Every managed resource of one type, from the root module and all child modules. */
export function plannedResources<Values>(plan: TerraformPlan, type: string): PlannedResource<Values>[] {
  return resourcesOf(plan.planned_values?.root_module).filter(
    (resource): resource is PlannedResource<Values> => resource.mode === 'managed' && resource.type === type,
  );
}

function resourcesOf(module: PlanModule | undefined): PlannedResource[] {
  return [...(module?.resources ?? []), ...(module?.child_modules ?? []).flatMap(resourcesOf)];
}
