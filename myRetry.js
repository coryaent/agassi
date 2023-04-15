"use strict";

const retry = require ('async-retry');
const axios = require ('axios');

(async () => {

    await retry(
        async (bail) => {
            // if anything throws, we retry
            const res = await axios.get ('https://google.invalid');
            console.log (res);

            if (403 === res.status) {
            // don't retry upon 403
            bail(new Error('Unauthorized'));
            return;
            }

            const data = await res.text();
            return data.substr(0, 500);
        },
        {
            retries: 5,
        }
    );
}) ();
