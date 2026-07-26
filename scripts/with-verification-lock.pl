#!/usr/bin/env perl

use strict;
use warnings;
use Fcntl qw(:flock SEEK_SET);
use Time::HiRes qw(sleep time);

my ($lock_file, @command) = @ARGV;
die "Usage: with-verification-lock.pl <lock-file> <command> [args...]\n"
  unless defined $lock_file && @command;

open my $lock, '>>', $lock_file or die "Cannot open verification lock $lock_file: $!\n";
my $queued_at = time;
my $reported_wait = 0;
while (!flock($lock, LOCK_EX | LOCK_NB)) {
  if (!$reported_wait) {
    seek($lock, 0, SEEK_SET);
    my $owner = <$lock> // 'unknown owner';
    chomp $owner;
    print STDERR "Queued behind active verification ($owner).\n";
    $reported_wait = 1;
  }
  sleep 0.2;
}

if ($reported_wait) {
  printf STDERR "Verification lock acquired after %.1fs.\n", time - $queued_at;
}

truncate($lock, 0) or die "Cannot clear verification lock $lock_file: $!\n";
seek($lock, 0, SEEK_SET);
print {$lock} "pid=$$ command=@command\n" or die "Cannot write verification lock $lock_file: $!\n";

$ENV{CONQUESTORIA_VERIFICATION_LOCK_HELD} = 1;
my $status = system { $command[0] } @command;
if ($status == -1) {
  die "Cannot run verification command: $!\n";
}
exit($status >> 8) if ($status & 127) == 0;
exit(128 + ($status & 127));
