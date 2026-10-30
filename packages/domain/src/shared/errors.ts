export class DomainRuleError extends Error {
  readonly code = "DOMAIN_RULE_VIOLATION";

  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainRuleError";
  }
}
