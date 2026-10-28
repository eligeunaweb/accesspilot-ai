# Public local TLS fixture

localhost-cert.pem and localhost-test-key.pem are a self-signed, public test pair
generated for this repository. They have no production use or confidentiality.
Only the TLS tests explicitly trust this fixture. Product TLS verification remains
on and no project option can disable it. Replace these files if they expire; never
install the certificate in a system trust store or use the key on a real server.
