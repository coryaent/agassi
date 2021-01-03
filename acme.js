"use strict";


print (`initializing Let's Encrypt account...`);
await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [email]
});