import { Component, input, output } from "@angular/core";
import { Icon } from "../../../shared/ui/icon";

@Component({
  selector: "assistant-welcome",
  imports: [Icon],
  templateUrl: "./assistant-welcome.html",
  styleUrl: "./assistant-welcome.css",
})
export class AssistantWelcome {
  readonly name = input("");
  readonly busy = input(false);
  readonly choose = output<string>();
  protected readonly suggestions = [
    {
      title: "Mi dinero hoy",
      question: "¿Qué saldos tengo y qué tan actualizados están?",
      icon: "wallet" as const,
    },
    {
      title: "Entender mis gastos",
      question: "¿Cómo va mi gasto de este mes frente al anterior?",
      icon: "trend" as const,
    },
    {
      title: "Mi plan de ingresos",
      question: "¿Cuánto ingreso esperaba y cuánto he recibido este mes?",
      icon: "income" as const,
    },
    {
      title: "Avanzar con calma",
      question:
        "¿Qué presupuestos y metas tengo? Distingue mis objetivos del avance medido.",
      icon: "target" as const,
    },
  ];
}
