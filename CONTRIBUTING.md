# Contributing to EvoSquares

Thank you for considering contributing to **EvoSquares**! We welcome all kinds of contributions, including bug reports, feature requests, documentation updates, and code contributions.

## Table of Contents

1. [How to Get Started](#how-to-get-started)
2. [Reporting Issues](#reporting-issues)
3. [Suggesting Enhancements](#suggesting-enhancements)
4. [Submitting Pull Requests](#submitting-pull-requests)
5. [Code Style Guidelines](#code-style-guidelines)
6. [Community Code of Conduct](#community-code-of-conduct)

---

## How to Get Started

1. **Fork the Repository**:  
   Create your own copy of the repository by clicking the "Fork" button at the top-right of the repository page.

2. **Clone Your Fork**:  
   Clone your fork to your local development environment:

   ```bash
   git clone https://github.com/your-username/EvoSquares.git
   ```

3. **Set Up the Environment**:  
   Follow the instructions in the [README.md](README.md) file to set up the project locally.

4. **Create a Branch**:  
   Create a branch for your work to keep your changes organized:
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## Reporting Issues

If you encounter a bug or want to request a new feature:

1. **Check Existing Issues**:  
   Look through the [Issues](../../issues) to see if your problem or suggestion has already been reported.

2. **Open a New Issue**:  
   If it hasn’t been reported yet, open a new issue. Provide as much detail as possible, including:
   - A clear title and description.
   - Steps to reproduce the issue (if applicable).
   - Screenshots or code snippets (if relevant).

---

## Suggesting Enhancements

We’re always open to new ideas! If you have an idea for a feature or improvement:

- Check the existing [Issues](../../issues) to see if someone else has already proposed it.
- Create a new issue labeled **enhancement** with a detailed description of your idea.

---

## Submitting Pull Requests

1. **Make Your Changes**:  
   Implement your changes in your branch. Ensure your code is clean, well-documented, and adheres to the project's code style.

2. **Test Your Changes**:  
   Before submitting your changes, run the checks from the repository root (see [docs/development.md](docs/development.md)):

   ```bash
   pnpm format:check
   pnpm check
   pnpm build
   ```

   Simulation changes must keep the engine deterministic and respect the [package dependency rules](docs/architecture/dependency-diagram.md).

3. **Push Your Branch**:  
   Push your changes to your forked repository:

   ```bash
   git push origin feature/your-feature-name
   ```

4. **Submit a Pull Request**:  
   Open a pull request (PR) to the main repository. Include the following in your PR description:
   - A summary of the changes.
   - References to related issues or discussions (if applicable).
   - Any additional context that reviewers might need.

---

## Code Style Guidelines

- **JavaScriptTypeScript**: Follow standard ES6+ practices.
- **Documentation**: Use clear and concise language. Include comments for complex code.

---

## Community Code of Conduct

This project adheres to the [GitHub Community Guidelines](https://docs.github.com/en/site-policy/github-terms/github-community-guidelines). By participating, you agree to uphold a respectful, inclusive, and collaborative environment.

---

Thank you for your contributions and support!  
Let’s make EvoSquares better together. 🎉
