// The parts of `terraform show -json` output that the local development scripts read.
// A plan describes every resource in the Terraform configuration without applying anything, so
// local resources can follow Terraform instead of a copy of its definitions.
export type TerraformPlan = {
  planned_values?: {
    root_module?: PlanModule;
    outputs?: Record<string, { value?: unknown }>;
  };
};

export type PlanModule = { resources?: PlannedResource[]; child_modules?: PlanModule[] };

// A resource instance as the plan expects it after apply.
// Values known only after apply, such as the IDs of resources that were never deployed, are
// missing.
export type PlannedResource<Values = unknown> = {
  mode: string;
  type: string;
  // The instance key of a resource created with for_each or count.
  index?: string | number;
  values: Values;
};
