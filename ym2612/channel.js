import {Operator} from "./operator";

export class Channel {
  constructor(name) {
    this.name = `[${name}]`;
    this.operators = [
      new Operator(`${name} OP1`),
      new Operator(`${name} OP2`),
      new Operator(`${name} OP3`),
      new Operator(`${name} OP4`)
    ];
    this.algorithm = 0;
  }

  processSamples(outputSamples) {
    const slotPerAlgo = [
      8,
      8,
      8,
      8,
      8 + 2,
      2 + 4 + 8,
      2 + 4 + 8,
      1 + 2 + 4 + 8,
    ];

    for (let i = 0; i < 4; i++) {
      if (slotPerAlgo[this.algorithm] & 1 << i) {
        this.operators[i].processSamples(outputSamples);
      }
    }
    return outputSamples;
  }
}