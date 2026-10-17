// The parts of `terraform show -json` output that local development scripts read.
// A plan describes every resource without applying anything.
// Local resources follow it instead of a copy of the Terraform definitions.
export type TerraformPlan = {
  planned_values?: {
    root_module?: PlanModule;
    outputs?: Record<string, { value?: unknown }>;
  };
};

export type PlanModule = { resources?: PlannedResource[]; child_modules?: PlanModule[] };

// A resource instance as the plan expects it after apply.
// Values known only after apply, such as IDs of undeployed resources, are missing.
export type PlannedResource<Values = unknown> = {
  mode: string;
  type: string;
  // The instance key of a resource created with for_each or count.
  index?: string | number;
  values: Values;
};
