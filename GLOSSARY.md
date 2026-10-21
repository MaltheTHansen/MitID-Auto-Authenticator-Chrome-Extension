# MitID Auto Authenticator

A browser extension that approves MitID test-environment logins for developers, so testing MitID login flows doesn't require a phone or the MitID test tool's app simulator page.

## Language

**Identity**:
A MitID test login in the pre-production environment, known by its user ID (e.g. `Theo404`).
_Avoid_: User, test person

**CPR number**:
The Danish personal identification number registered on an Identity in the MitID test environment.
_Avoid_: personnummer, CPR-nr.

**Simulator**:
The simulated MitID code app attached to an Identity, standing in for a phone.
_Avoid_: Authenticator, app, device

**Login request**:
A pending MitID login for an Identity, waiting to be answered by its Simulator.
_Avoid_: Auth request, login attempt, ticket

**Approve**:
To confirm a Login request on behalf of the Identity's Simulator.
_Avoid_: Authenticate, authorize, validate

## Relationships

- An **Identity** has one active **Simulator**.
- A **Login request** belongs to one **Identity** and is answered through its **Simulator**.