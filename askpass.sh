#!/bin/sh
echo "Password for '$1':" >&2
read -r password
echo "$password"