# API references and implementation notes

Documentation checked October 29, 2026 for the original implementation. Availability, pricing, and subscriber benefits can change. The original account-specific verification log is kept separately in ignored local runtime storage and is not included in the source package.

- [Image generation](https://developers.openai.com/api/docs/guides/image-generation): the configured Sunburst and Flare models, quality choices, and custom dimensions follow the documented API at the date above. Dimension rules are multiples of 16, edges no larger than 3840, aspect ratio from 1:3 through 3:1, and 655,360–8,294,400 pixels. Resolutions above 3,686,400 pixels are marked experimental.
- [Sunburst model](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) and [Flare model](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare): the dated standard token rates in this version are $5 per million text input tokens, $8 image input, and $30 image output. The app does not invent a fixed per-4K price.
- [Image generation request](https://developers.openai.com/api/reference/resources/images/methods/generate): one Images API generation request, one output, PNG, opaque background. The response contains base64 image data; no automatic fallback or paid retry is made.
- [Image edit request](https://developers.openai.com/api/reference/resources/images/methods/edit): reference images are supplied as base64 data URLs in their selected order. Choosing a file locally does not submit an API request.
- [API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits): eligibility and benefit amounts are controlled by OpenAI. A dated local account snapshot is not proof of another account's credits or current balance.

## Implementation

- Credentials use the macOS Security framework through a small Python helper. The shared Keychain service/account names remain unchanged across the OAIA Studio rename so existing setup keeps working. Hidden local entry is the only key-configuration interface.
- Each paid job uses one native fetch call, with redirects blocked. Uncertain outcomes are recorded without resubmission. A later request requires explicit user action.
- Native image bytes are saved without upscaling. PNG chunks, checksums, and compressed data are validated. JPEG/WebP inputs receive signature checks rather than full decoding.
- Local-network access accepts IPv4 clients from connected private subnets, with local Host and same-origin request checks. There is no password or public tunnel. The README explains the access implications.
- Named studios bind an actual free socket, validate studio/workspace/run identity when reopening, and stop through a private loopback-only control request. Runtime and image-directory locks prevent duplicate ownership and protect shared history across app copies.
- Offline tests cover the request, reference, image-preservation, lifecycle, portability, and packaging safeguards. Historical paid checks do not run as part of the test suite.
