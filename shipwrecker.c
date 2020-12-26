#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main() { 

    char * socket_path = getenv ("SOCKET_PATH");
    if (socket_path == NULL) {
        socket_path = "/tmp/shipwreck.sock";
    };

	seteuid (0);
	setegid (0);

	if ( execlp ("shipwreck", "shipwreck", "-vvv", "--force", "--mode", "666", "--to", strcat ("unix://localhost", socket_path),(char *) NULL) ) { exit (EXIT_FAILURE); }

	exit (EXIT_SUCCESS);

}