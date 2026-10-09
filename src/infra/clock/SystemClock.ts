import { Clock } from "@application/ports/Clock";
import { Injectable } from "@kernel/decorators/injectable";

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
