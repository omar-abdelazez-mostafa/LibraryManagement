# Open Shelf project summary

Open Shelf is a three layer library management application deployed through GitHub Actions. The frontend is static HTML/CSS/JavaScript served by Nginx, the Express backend handles authentication and library transactions, and PostgreSQL stores users, books, inventory, and borrowing/purchase history.

Terraform creates a separate network and four small Ubuntu instances in AWS Paris. Ansible installs and configures kubeadm. Kubernetes runs the website, API, and PostgreSQL. The application database is pinned to worker 1 using a local persistent volume.

The workflow builds and publishes the containers, applies Terraform, configures the cluster, deploys the app, and waits for the workloads to become ready. Required Actions secrets and the deployment URL are documented in `README.md`.
