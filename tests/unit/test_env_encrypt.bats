#!/usr/bin/env bats

load '../test_helper/bats-support/load'
load '../test_helper/bats-assert/load'

setup() {
  TEST_TMPDIR=$(mktemp -d)
  source "${BATS_TEST_DIRNAME}/../../src/crabcode"
  ENV_SNAPSHOT_DIR="$TEST_TMPDIR/snapshots"
  staging_dir="$TEST_TMPDIR/staging"
  mkdir -p "$staging_dir"
  printf 'Fixture recipe\n' > "$staging_dir/recipe.md"
  output_file="$TEST_TMPDIR/snapshot.enc"

  # Use a fixture password so tests exercise real encryption without a prompt.
  openssl() { command openssl "$@" -pass pass:crabcode-test-fixture; }
}

teardown() {
  rm -rf "$TEST_TMPDIR"
}

@test "env encrypt rejects missing staging directories and recipes" {
  run env_encrypt
  assert_failure
  assert_output --partial 'Staging directory not found'
  rm "$staging_dir/recipe.md"
  run env_encrypt "$staging_dir" "$output_file"
  assert_failure
  assert_output --partial 'No recipe.md'
  [ ! -e "$output_file" ]
}

@test "env encrypt round-trips a relative staging path and removes it after success" {
  cd "$TEST_TMPDIR"
  run handle_env_command encrypt ./staging ./snapshot.enc
  assert_success
  [ ! -e "$staging_dir" ]
  mkdir "$TEST_TMPDIR/restored"
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$output_file" \
    | tar xzf - -C "$TEST_TMPDIR/restored"
  run cat "$TEST_TMPDIR/restored/staging/recipe.md"
  assert_output 'Fixture recipe'
}

@test "env encrypt supports staging names that begin with a dash" {
  mv "$staging_dir" "$TEST_TMPDIR/--fixture"
  run env_encrypt "$TEST_TMPDIR/--fixture" "$output_file"
  assert_success
  run bash -c 'openssl enc -d -aes-256-cbc -pbkdf2 -in "$1" -pass pass:crabcode-test-fixture | tar tzf -' _ "$output_file"
  assert_success
  assert_output --partial '--fixture/recipe.md'
}

@test "env encrypt preserves an existing output file" {
  printf 'Previous backup\n' > "$output_file"
  run env_encrypt "$staging_dir" "$output_file"
  assert_failure
  assert_output --partial 'already exists'
  [ -f "$staging_dir/recipe.md" ]
  run cat "$output_file"
  assert_output 'Previous backup'
}

@test "env encrypt rejects output inside staging including symlinked directories" {
  ln -s "$staging_dir" "$TEST_TMPDIR/link"
  for destination in "$staging_dir/snapshot.enc" "$TEST_TMPDIR/link/snapshot.enc"; do
    run env_encrypt "$staging_dir" "$destination"
    assert_failure
    assert_output --partial 'outside the staging directory'
    [ -f "$staging_dir/recipe.md" ]
    [ ! -e "$destination" ]
  done
}

@test "env encrypt preserves staging and removes partial output on encryption failure" {
  openssl() { cat >/dev/null; return 1; }
  run env_encrypt "$staging_dir" "$output_file"
  assert_failure
  [ -f "$staging_dir/recipe.md" ]
  [ ! -e "$output_file" ]
  run find "$TEST_TMPDIR" -name '.crab-env-*'
  assert_output ''
}

@test "env encrypt preserves staging when tar fails" {
  tar() { return 1; }
  run env_encrypt "$staging_dir" "$output_file"
  assert_failure
  [ -f "$staging_dir/recipe.md" ]
  [ ! -e "$output_file" ]
}

@test "env encrypt uses the default snapshot directory when output is omitted" {
  run handle_env_command encrypt "$staging_dir"
  assert_success
  [ ! -e "$staging_dir" ]
  run find "$ENV_SNAPSHOT_DIR" -name 'env-snapshot-*.enc'
  assert_success
  [ -n "$output" ]
}
