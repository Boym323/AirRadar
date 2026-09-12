import { BkgGermanyPolandBoundaryProvider } from "./bkg-boundary";
import { CuzkStateBoundaryProvider, type StateBoundaryInput, type StateBoundaryResolution } from "./cz-boundary";

export type StateBoundaryReference =
  | { kind: "czech-border"; neighbour: "DE" | "PL" | "AT" | "SK" }
  | { kind: "austrian-border"; neighbour: "CZ" | "SK" | "HU" | "DE" | "CH" | "IT" | "SI" }
  | { kind: "foreign-border"; countryA: "DE"; countryB: "PL" };

export interface BoundaryResolver {
  getBoundarySegment(reference: StateBoundaryReference, input: StateBoundaryInput): StateBoundaryResolution;
}

export class AuthoritativeBoundaryResolver implements BoundaryResolver {
  constructor(
    private readonly czech: CuzkStateBoundaryProvider,
    private readonly germanyPoland: BkgGermanyPolandBoundaryProvider,
    private readonly austrian?: BoundaryResolver,
  ) {}

  async load(): Promise<void> {
    await Promise.all([this.czech.load(), this.germanyPoland.load()]);
  }

  getBoundarySegment(reference: StateBoundaryReference, input: StateBoundaryInput): StateBoundaryResolution {
    if (reference.kind === "czech-border") return this.czech.getBoundarySegment(input);
    if (reference.kind === "austrian-border") {
      if (!this.austrian) throw new Error("Austrian BEV boundary provider is not configured");
      return this.austrian.getBoundarySegment(reference, input);
    }
    return this.germanyPoland.getBoundarySegment(input);
  }
}
