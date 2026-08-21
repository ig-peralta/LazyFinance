import { Injectable } from "@nestjs/common";

@Injectable()
export class BalanceService {
  private _balance: number = 1000;

  getBalance(): number {
    return this._balance;
  }

  addBalance(amount: number): void {
    this._balance += amount;
  }

  subtractBalance(amount: number): void {
    this._balance -= amount;
  }
}
