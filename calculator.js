const display = document.querySelector("#display");
const operationDisplay = document.querySelector("#operation-display");
const calculator = document.querySelector(".calculator");

let firstNumber = null;
let operation = null;
let waitingForSecondNumber = false;

function pressNumber(value) {
    const current = display.textContent;
    if (waitingForSecondNumber || current === "0" || current === "Error") {
        display.textContent = value;
        waitingForSecondNumber = false;
    } else {
        display.textContent = current + value;
    }
}

function pressDecimal() {
    if (waitingForSecondNumber) {
        display.textContent = "0.";
        waitingForSecondNumber = false;
        return;
    }
    if (!display.textContent.includes(".")) display.textContent += ".";
}

function pressOperator(symbol) {
    firstNumber = Number.parseFloat(display.textContent);
    operation = symbol;
    operationDisplay.textContent = symbol;
    waitingForSecondNumber = true;
}

function calculate() {
    if (firstNumber === null || operation === null) return;

    const secondNumber = Number.parseFloat(display.textContent);
    let result;

    if (operation === "+") result = firstNumber + secondNumber;
    else if (operation === "-") result = firstNumber - secondNumber;
    else if (operation === "*") result = firstNumber * secondNumber;
    else if (operation === "/") {
        if (secondNumber === 0) {
            display.textContent = "Error";
            resetCalculation();
            return;
        }
        result = firstNumber / secondNumber;
    }

    display.textContent = String(result);
    resetCalculation();
}

function resetCalculation() {
    firstNumber = null;
    operation = null;
    operationDisplay.textContent = "";
    waitingForSecondNumber = false;
}

function clear() {
    display.textContent = "0";
    resetCalculation();
}

calculator.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.number !== undefined) pressNumber(button.dataset.number);
    else if (button.dataset.operator !== undefined) pressOperator(button.dataset.operator);
    else if (button.dataset.action === "decimal") pressDecimal();
    else if (button.dataset.action === "calculate") calculate();
    else if (button.dataset.action === "clear") clear();
});

document.addEventListener("keydown", (event) => {
    if (/^[0-9]$/.test(event.key)) pressNumber(event.key);
    else if (["+", "-", "*", "/"].includes(event.key)) pressOperator(event.key);
    else if (event.key === "." || event.key === ",") pressDecimal();
    else if (event.key === "Enter" || event.key === "=") calculate();
    else if (event.key === "Escape") clear();
});
