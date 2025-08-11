import 'cypress-mochawesome-reporter/register';
import '@testing-library/cypress/add-commands';

Cypress.Commands.add('recordAction', (name, start) => {
  const durationMs = Date.now() - start;
  cy.task('recordAction', { name, durationMs });
});

afterEach(function () {
  const test = this.currentTest;
  if (test) {
    cy.task('recordStep', { name: test.title, status: test.state });
  }
});
