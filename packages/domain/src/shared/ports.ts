export interface IdGenerator {
  nextId(): string;
}

export interface Clock {
  nowUtc(): string;
}

export interface DomainDependencies {
  readonly ids: IdGenerator;
  readonly clock: Clock;
}
